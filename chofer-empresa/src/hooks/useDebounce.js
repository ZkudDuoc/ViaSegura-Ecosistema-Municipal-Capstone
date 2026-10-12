import { useEffect, useState } from "react";

// Devuelve `valor` recién cuando deja de cambiar por `ms` milisegundos. Sirve
// para no llamar a la API en cada tecla de una búsqueda.
export default function useDebounce(valor, ms = 300) {
  const [estable, setEstable] = useState(valor);

  useEffect(() => {
    const t = setTimeout(() => setEstable(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);

  return estable;
}