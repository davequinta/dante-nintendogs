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

## Cómo está hecho Dante (técnicas de Three.js)

Todo el perro sale de código; no hay modelos externos.

- **Esqueleto propio**: 19 `Bone` (cuerpo, cuello, cabeza, mandíbula, orejas, 4 patas de dos segmentos, cola de 5 segmentos) en un `Skeleton`.
- **Forma por campo de distancia**: cada hueso lleva elipsoides y cápsulas (funciones SDF) que se funden con una unión suave exponencial. La boca y las cuencas de los ojos se tallan restando un bloque y dos elipsoides.
- **Marching cubes**: la superficie se extrae de la grilla de distancias con vértices compartidos por arista, normales calculadas del gradiente del campo y UVs triplanares. Las tablas de casos vienen del addon `MarchingCubes` de three; el polígonizador es propio. Tarda unos 200 ms.
- **Skinning calculado a mano**: cada vértice recibe hasta 4 huesos con pesos según la distancia a las primitivas que lo formaron, y va a un `SkinnedMesh`. Con eso las poses (sit, platz, panza arriba, pose de show) y la marcha son solo rotaciones de huesos.
- **Colores por vértice**: el manto negro, el fuego y la máscara se mezclan en los bordes ponderando las primitivas cercanas, así no hay costuras.
- **Anatomía y pies**: cruz alta, lomo inclinado, pecho profundo, patas traseras anguladas en la pose de bind y un hueso de pie por pata que se compensa cada frame para pisar plano. Párpados que rotan para parpadear, iris y pupila, colmillos y fosas nasales son mallas pequeñas colgadas de los huesos.
- **Fins de silueta**: por cada tantos vértices se emite una tira de hebras perpendicular a la piel, skineada con los mismos pesos; el shader la muestra solo cuando la superficie está de canto respecto a la cámara, así el contorno se ve peludo sin ensuciar el interior.
- **Pelo por capas (shells)**: 10 copias del `SkinnedMesh` (5 en celular) con un `MeshStandardMaterial` modificado en `onBeforeCompile`: después del skinning cada capa se desplaza por la normal según un largo por vértice, cae con gravedad, se mece con el tiempo y oscurece la raíz. Un mapa de ruido de hebras decide qué fragmentos sobreviven en cada capa.
- **Post-proceso**: oclusión ambiental en pantalla (`GTAOPass`) en escritorio, apagada en celular; sombra de contacto suave bajo el perro en todos los dispositivos.
- **Entorno**: cielo HDRI real (`kloofendal_48d_partly_cloudy_puresky` de Poly Haven, CC0) muestreado en el domo por dirección, que rota con la hora de El Salvador para que el sol del cielo coincida con la luz direccional, y que también alimenta el mapa de entorno. Las baldosas y los ladrillos son recortes de fotos del patio real; el pelo usa un recorte de la pechera de Dante como detalle pasa-altos. Grama y follaje son cartas instanciadas con texturas dibujadas en canvas.
- **Escena**: domo de cielo con shader que también genera el mapa de entorno (`PMREMGenerator`), grama con `InstancedMesh` y vertex shader de viento, texturas y relieves procedurales en canvas, sombras PCF suaves y `OrbitControls` acotados.
- **Interacción**: `Raycaster` sobre la malla skineada; la zona acariciada (cabeza, panza, cola) sale de un atributo por vértice.

Hay una bitácora con capturas de hasta dónde llegó el enfoque de código puro en [docs/PROGRESO-THREEJS.md](docs/PROGRESO-THREEJS.md).

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
