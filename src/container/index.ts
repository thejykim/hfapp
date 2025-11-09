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

  // Infrastructure dependencies will be registered here
  // Example:
  // get database() {
  //   return this.getSingleton('database', () => new Database());
  // }
  //
  // get userRepository() {
  //   return this.getSingleton('userRepository', () => new UserRepository(this.database));
  // }

  // Use cases will be registered here
  // Example:
  // get createUserUseCase() {
  //   return new CreateUserUseCase(this.userRepository, this.emailService);
  // }

  // Controllers will be registered here
  // Example:
  // get userController() {
  //   return new UserController(this.createUserUseCase, this.getUserByIdUseCase);
  // }
}

// Export singleton container instance
export const container = new Container();
