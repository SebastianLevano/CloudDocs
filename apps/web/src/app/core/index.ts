// Core module barrel — singletons, interceptors, guards, base services.
export { API_BASE_URL } from './api/api.config';
export { AuthService, type AuthStatus } from './auth/auth.service';
export { authInterceptor } from './interceptors/auth.interceptor';
export { errorInterceptor } from './interceptors/error.interceptor';
export { authGuard } from './guards/auth.guard';
export { guestGuard } from './guards/guest.guard';
