/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "hfapp",
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // Dynamic imports as required by SST
    const { readFileSync } = await import("fs");

    // ========================================
    // Secrets
    // ========================================
    const hfClientId = new sst.Secret("HF_CLIENT_ID");
    const hfClientSecret = new sst.Secret("HF_CLIENT_SECRET");
    const proxyApiKey = new sst.Secret("PROXY_API_KEY");
    const sessionSecret = new sst.Secret("SESSION_SECRET");

    // ========================================
    // EC2 Proxy Infrastructure
    // ========================================

    // Read proxy script
    const proxyScript = readFileSync("src/infrastructure/proxy/proxy.py", "utf-8");

    // Get default VPC to simplify setup (no NAT gateway costs)
    const defaultVpc = await aws.ec2.getVpc({ default: true });
    const defaultSubnets = await aws.ec2.getSubnets({
      filters: [{ name: "vpc-id", values: [defaultVpc.id] }],
    });

    // IAM role for EC2 instance (CloudWatch Logs access)
    const ec2Role = new aws.iam.Role("HfProxyRole", {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            Service: "ec2.amazonaws.com"
          }
        }]
      })
    });

    // Attach CloudWatch Logs policy
    new aws.iam.RolePolicyAttachment("HfProxyCloudWatchPolicy", {
      role: ec2Role.name,
      policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
    });

    // Create instance profile
    const instanceProfile = new aws.iam.InstanceProfile("HfProxyInstanceProfile", {
      role: ec2Role.name
    });

    // CloudWatch Log Group for proxy logs
    const proxyLogGroup = new aws.cloudwatch.LogGroup("HfProxyLogGroup", {
      name: "/aws/ec2/hf-proxy",
      retentionInDays: 7, // Keep logs for 7 days to manage costs
    });

    // Security group - allow proxy port and SSH
    const securityGroup = new aws.ec2.SecurityGroup("HfProxySecurityGroup", {
      vpcId: defaultVpc.id,
      description: "Security group for HackForums API proxy",
      ingress: [
        {
          protocol: "tcp",
          fromPort: 8080,
          toPort: 8080,
          cidrBlocks: ["0.0.0.0/0"],
          description: "Proxy traffic",
        },
        {
          protocol: "tcp",
          fromPort: 22,
          toPort: 22,
          cidrBlocks: ["0.0.0.0/0"],
          description: "SSH access",
        },
      ],
      egress: [
        {
          protocol: "-1",
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ["0.0.0.0/0"],
          description: "Allow all outbound",
        },
      ],
    });

    // Get latest Amazon Linux 2023 AMI
    const ami = await aws.ec2.getAmi({
      mostRecent: true,
      owners: ["amazon"],
      filters: [
        {
          name: "name",
          values: ["al2023-ami-2023.*-x86_64"],
        },
        {
          name: "virtualization-type",
          values: ["hvm"],
        },
      ],
    });

    // Create EC2 instance
    const proxyInstance = new aws.ec2.Instance("HfProxyInstance", {
      instanceType: "t3.nano",
      ami: ami.id,
      vpcSecurityGroupIds: [securityGroup.id],
      subnetId: defaultSubnets.ids[0],
      associatePublicIpAddress: true,
      iamInstanceProfile: instanceProfile.name,
      userData: $interpolate`#!/bin/bash
set -e

echo "Starting HackForums proxy setup..."

# Update system
yum update -y

# Install Python 3 and pip (should already be installed on AL2023)
yum install -y python3 python3-pip

# Install Python dependencies
pip3 install requests

# Install and configure CloudWatch agent
yum install -y amazon-cloudwatch-agent

# Create CloudWatch agent config for journald logs
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CLOUDWATCH_CONFIG_EOF'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/cloud-init-output.log",
            "log_group_name": "/aws/ec2/hf-proxy",
            "log_stream_name": "{instance_id}/cloud-init",
            "timezone": "UTC"
          }
        ]
      }
    },
    "log_stream_name": "{instance_id}/default",
    "force_flush_interval": 15
  }
}
CLOUDWATCH_CONFIG_EOF

# Also configure to collect journald logs via additional config
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.d/journal.json << 'JOURNAL_CONFIG_EOF'
{
  "logs": {
    "metrics_collected": {
      "cpu": {
        "measurement": []
      }
    }
  }
}
JOURNAL_CONFIG_EOF

# Enable journald collection directly via systemd
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/cloudwatch.conf << 'JOURNALD_CONF_EOF'
[Journal]
Storage=persistent
ForwardToSyslog=yes
JOURNALD_CONF_EOF

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

# Create proxy directory
mkdir -p /opt/hf-proxy

# Write proxy script
cat > /opt/hf-proxy/proxy.py << 'PROXY_SCRIPT_EOF'
${proxyScript}
PROXY_SCRIPT_EOF

chmod +x /opt/hf-proxy/proxy.py

# Write systemd service with environment variables
cat > /etc/systemd/system/hf-proxy.service << 'SERVICE_EOF'
[Unit]
Description=HackForums API Proxy
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/hf-proxy
Environment="PROXY_API_KEY=${proxyApiKey.value}"
Environment="PORT=8080"
ExecStart=/usr/bin/python3 /opt/hf-proxy/proxy.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE_EOF

# Start service
systemctl daemon-reload
systemctl enable hf-proxy
systemctl start hf-proxy

echo "Setup complete at $(date)" > /var/log/hf-proxy-setup.log
`,
      tags: {
        Name: "HackForums API Proxy v2",
      },
    }, { replaceOnChanges: ["userData"] });

    // Allocate Elastic IP for static IP whitelisting
    const elasticIp = new aws.ec2.Eip("HfProxyEip", {
      instance: proxyInstance.id,
      tags: {
        Name: "HackForums Proxy IP",
      },
    });

    // ========================================
    // DNS - Route53 Hosted Zone
    // ========================================
    const zone = new aws.route53.Zone("HackforumsZone", {
      name: "hackforums.app",
      comment: "Managed by SST",
    });

    // ========================================
    // Next.js Application
    // ========================================
    const nextApp = new sst.aws.Nextjs("hfapp", {
      domain: "hackforums.app",
      link: [hfClientId, hfClientSecret, proxyApiKey, sessionSecret],
      environment: {
        PROXY_URL: $interpolate`http://${elasticIp.publicIp}:8080`,
      },
    });

    // ========================================
    // Outputs
    // ========================================
    return {
      elasticIp: elasticIp.publicIp,
      proxyUrl: $interpolate`http://${elasticIp.publicIp}:8080`,
      nextAppUrl: nextApp.url,
      nameservers: zone.nameServers,
      message: "Add the Elastic IP to your HackForums API whitelist. Update Porkbun nameservers to the ones listed above.",
    };
  },
});
