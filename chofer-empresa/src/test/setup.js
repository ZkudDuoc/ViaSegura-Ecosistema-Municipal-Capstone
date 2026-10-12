import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Cada test parte con la pantalla vacía y sin sesión guardada.
afterEach(() => {
  cleanup();
  localStorage.clear();
});