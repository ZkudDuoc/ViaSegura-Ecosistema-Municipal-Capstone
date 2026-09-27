export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";
export const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");