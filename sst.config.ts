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
      userData: $interpolate`#!/bin/bash
set -e

echo "Starting HackForums proxy setup..."

# Update system
yum update -y

# Install Python 3 and pip (should already be installed on AL2023)
yum install -y python3 python3-pip

# Install Python dependencies
pip3 install requests

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
Environment="HF_CLIENT_ID=${hfClientId.value}"
Environment="HF_CLIENT_SECRET=${hfClientSecret.value}"
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
    // Next.js Application
    // ========================================
    const nextApp = new sst.aws.Nextjs("hfapp", {
      link: [proxyApiKey],
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
      message: "Add the Elastic IP to your HackForums API whitelist",
    };
  },
});
