"use client";

import { useEffect, useState } from "react";

const MESSAGES = [
  "Nuevo pedido entregado en Zapopan 🍕",
  "Cliente feliz en Tonalá 🌮",
  "Nuevo aliado agregado: Panadería Delicias 🥖",
  "Repartidor rumbo a Tlaquepaque 🚲",
  "Promoción activa en Cafetería Central ☕",
];

export function LiveActivity() {
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    let timeout: number | undefined;
    const interval = window.setInterval(() => {
      setAnimate(true);
      timeout = window.setTimeout(() => {
        setIndex((prev) => (prev + 1) % MESSAGES.length);
        setAnimate(false);
      }, 300);
    }, 10000);

    return () => {
      window.clearInterval(interval);
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="absolute left-1/2 top-6 z-20 flex -translate-x-1/2 items-center justify-center">
      <div
        className={`rounded-full border border-white/40 bg-white/10 px-4 py-1 text-sm font-medium text-white transition duration-300 ${
          animate ? "-translate-y-1 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        {MESSAGES[index]}
      </div>
    </div>
  );
}

export default LiveActivity;
