import { useEffect, useState } from "react";
import api from "../services/api";

// Nombre de la comuna del operador (la sesión solo trae su id).
export default function useNombreComuna(comunaId) {
  const [nombre, setNombre] = useState(null);
  useEffect(() => {
    if (!comunaId) return;
    api
      .get("/comunas")
      .then((res) => setNombre(res.data.find((c) => c.id === comunaId)?.nombre ?? null))
      .catch(() => {});
  }, [comunaId]);
  return nombre;
}