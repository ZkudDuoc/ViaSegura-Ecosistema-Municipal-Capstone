import api from "./api";

export function login(email, password) {
  return api.post("/auth/login", { email, password }).then((res) => res.data);
}
