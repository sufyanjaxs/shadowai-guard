import { initInterceptor } from './interceptor';

console.log("ShadowAI Guard content script loaded on:", window.location.hostname);

// Initialize the interception logic
initInterceptor();
