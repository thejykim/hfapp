import { ISessionStore } from "../core/interfaces/gateways/session-store.gateway";
import { IronSessionStore } from "../infrastructure/gateways/iron-session-store.gateway";

/**
 * Dependency Injection Container
 *
 * Simple container for managing application dependencies with lazy initialization.
 * Services are created as singletons on first access.
 */
class Container {
	private instances = new Map<string, unknown>();

	/**
	 * Get or create a singleton instance
	 */
	private getSingleton<T>(key: string, factory: () => T): T {
		if (!this.instances.has(key)) {
			this.instances.set(key, factory());
		}
		return this.instances.get(key) as T;
	}

	// ============================================
	// Infrastructure - Gateways
	// ============================================

	/**
	 * Session store for managing user authentication sessions
	 */
	get sessionStore(): ISessionStore {
		return this.getSingleton("sessionStore", () => new IronSessionStore());
	}

	// ============================================
	// Use Cases
	// ============================================
	// Example:
	// get createUserUseCase() {
	//   return new CreateUserUseCase(this.userRepository, this.emailService);
	// }

	// ============================================
	// Controllers
	// ============================================
	// Example:
	// get userController() {
	//   return new UserController(this.createUserUseCase, this.getUserByIdUseCase);
	// }
}

// Export singleton container instance
export const container = new Container();
