import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Outlines, Environment, useTexture } from "@react-three/drei"
import { Physics, useSphere } from "@react-three/cannon"
import { EffectComposer, N8AO, SMAA, Bloom } from "@react-three/postprocessing"
import { useControls } from "leva"


const rfs = THREE.MathUtils.randFloatSpread
const sphereGeometry = new THREE.SphereGeometry(0.1, 64, 64)
const baubleMaterial = new THREE.MeshStandardMaterial({ color: "white", roughness: 0, envMapIntensity: 1 })


export const App = () => {
  return (
    // dpr[1,2]
    <Canvas shadows gl={{ antialias: false }} dpr={window.devicePixelRatio} camera={{ position: [0, 0, 20], fov: 35, near: 1, far: 40 }} style={{ width: "100vw", height: "100vh" }}>
    <ambientLight intensity={0.5} />
    <color attach="background" args={["#dfdfdf"]} />
    <spotLight intensity={1} angle={0.2} penumbra={1} position={[30, 30, 30]} castShadow shadow-mapSize={[512, 512]} />
    <Physics gravity={[0, 0, 0]} iterations={10}>
      {/* <Pointer /> */}
      <Clump />
    </Physics>
    <Environment files="/adamsbridge.hdr" />
    <EffectComposer disableNormalPass multisampling={0}>
      <N8AO halfRes color="grey" aoRadius={2} intensity={1} aoSamples={6} denoiseSamples={4} />
      <Bloom mipmapBlur levels={7} intensity={1} />
      <SMAA />
    </EffectComposer>
  </Canvas>
  );
}
// function generateCubePoints(count = 40, size = 10) {
//   const points = []
//   const n = Math.ceil(Math.cbrt(count)) // ~cube root of count
//   const step = size / (n - 1)           // spacing between points
//   const offset = size / 2               // center the cube

//   for (let x = 0; x < n; x++) {
//     for (let y = 0; y < n; y++) {
//       for (let z = 0; z < n; z++) {
//         if (points.length < count) {
//           points.push([
//             x * step - offset ,
//             y * step - offset,
//             z * step - offset
//           ])
//         }
//       }
//     }
//   }
//   return points
// }

function Clump({ mat = new THREE.Matrix4(), vec = new THREE.Vector3(), ...props}){
  // const { outlines } = useControls({ outlines: { value: 0.0, step: 0.01, min: 0, max: 0.05 } })
  const count = 5
  const texture = useTexture("/cross.jpg")
  // const points = generateCubePoints(300, 1)
  const [ref, api] = useSphere(() => ({ args: [0.1], mass: 10, angularDamping: 0.1, linearDamping: 0.65, position: [rfs(20), rfs(20), rfs(20)] }))
  useFrame((state) => {
    for (let i = 0; i < count; i++) {
      // Get current whereabouts of the instanced sphere
      ref.current.getMatrixAt(i, mat)
      // Normalize the position and multiply by a negative force.
      // This is enough to drive it towards the center-point.
      // api.at(i).applyForce(vec.setFromMatrixPosition(mat).normalize().multiplyScalar(-count).toArray(), [0, 0, 0])
      api.at(i).applyForce([0, i, 0], [0, 0, 0])
    }
  })
  return (
    <instancedMesh ref={ref} castShadow receiveShadow args={[sphereGeometry, baubleMaterial, count]} material-map={texture}>
      {/* <Outlines thickness={outlines} /> */}
    </instancedMesh>
  )
}
