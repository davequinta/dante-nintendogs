# Dante 🏅

Juego web 3D estilo Nintendogs protagonizado por Dante, pastor alemán de pelo largo y dos veces campeón salvadoreño (ACANSAL, FCI). Vive en El Salvador con David, su esposa y Kiara, la pastora veterana y gruñona de la casa.

Hecho con [Three.js](https://threejs.org/) y JavaScript puro. Sin modelos externos: Dante está armado con primitivas, pelo por capas (shells) en shader, y toda la IA es una máquina de estados. Los sonidos se sintetizan con Web Audio. Corre a 60 fps en un celular de gama media.

## Correr en local

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # genera dist/
npm run preview    # sirve dist/ para probar el build
```

## Estructura

```
index.html          página, HUD y barra de herramientas
public/             manifest PWA e íconos
src/
  style.css         estilos del overlay
  utils.js          helpers matemáticos y constantes del patio
  audio.js          sonidos sintetizados (ladrido, aullido, ronquido...)
  state.js          stats, mundo, entrenamiento, logros y localStorage
  scene.js          render, cielo, luces, patio, grama instanciada, pelo, partículas
  dog.js            modelo de perro parametrizable (Dante y Kiara), poses y marcha
  ai.js             máquina de estados de Dante, comandos, Kiara, visita, pelota
  main.js           interacción (raycaster, herramientas), UI, reloj, guardado y loop
```

## Deploy

Sitio estático en Vercel: `vercel.json` define el build de Vite y los headers de caché. Producción en https://dante.davidquinta.tech.

```bash
npx vercel          # preview
npx vercel --prod   # producción
```

Cada push a `main` en GitHub también despliega si el repo está conectado al proyecto de Vercel.

## Cómo se juega

- **Acariciar**: arrastrá sobre él. Cabeza, panza y cola reaccionan distinto.
- **Comida y agua**: llenan los platos; va solo cuando tiene hambre o sed.
- **Pelota**: arrastrá hacia arriba para apuntar y lanzar. La trae.
- **Cepillo**: sube limpieza y suelta pelos.
- **Trucos**: siete trucos con entrenamiento; el mango después de un truco da bono.
- **Visita**: alguien llega al portón y ladra hasta que lo calmás acariciándolo.
- **Noche**: por defecto sigue el reloj real de El Salvador. Va al kennel; solo llora si le cerrás la puerta.
- **Kiara** entra de vez en cuando por la puerta de la casa. Mejor no acercarse a su cama.
- Tocá el nombre "Dante" para ver logros, racha de días y entrenamiento.
