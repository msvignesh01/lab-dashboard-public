"use client"

import { Environment, Lightformer, useGLTF } from "@react-three/drei"
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber"
import {
  BallCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
  useRopeJoint,
  useSphericalJoint,
} from "@react-three/rapier"
import { MeshLineGeometry, MeshLineMaterial } from "meshline"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { cn } from "@/lib/utils"

const CARD_MODEL_URL = "/card.glb"

interface LanyardSceneProps {
  textureUrl: string
  position?: [number, number, number]
  containerClassName?: string
  interactive?: boolean
}

interface CardModel {
  nodes: {
    card: THREE.Mesh
    clip: THREE.Mesh
    clamp: THREE.Mesh
  }
  materials: {
    metal: THREE.MeshStandardMaterial
  }
}

export default function LanyardScene({
  textureUrl,
  position = [0, 0, 20],
  containerClassName,
  interactive = true,
}: LanyardSceneProps) {
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)")
    const update = () => setIsCompact(mediaQuery.matches)
    update()
    mediaQuery.addEventListener("change", update)
    return () => mediaQuery.removeEventListener("change", update)
  }, [])

  return (
    <div
      className={cn("relative flex size-full min-h-[520px] items-center justify-center", containerClassName)}
      data-testid="lanyard-scene"
    >
      <Canvas
        camera={{ position, fov: 20 }}
        dpr={[1, isCompact ? 1.4 : 1.8]}
        frameloop="demand"
        fallback={
          <div className="flex size-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            This browser cannot initialize the 3D credential.
          </div>
        }
        gl={{
          alpha: true,
          antialias: !isCompact,
          powerPreference: "high-performance",
          preserveDrawingBuffer: interactive,
        }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0x000000), 0)}
      >
        <ambientLight intensity={Math.PI} />
        <Suspense fallback={null}>
          <Physics gravity={[0, -40, 0]} timeStep={isCompact ? 1 / 30 : 1 / 60}>
            <Band compact={isCompact} interactive={interactive} textureUrl={textureUrl} />
          </Physics>
          <Environment blur={0.75}>
            <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
            <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
            <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
            <Lightformer intensity={10} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
          </Environment>
        </Suspense>
      </Canvas>
    </div>
  )
}

interface BandProps {
  compact: boolean
  interactive: boolean
  textureUrl: string
}

function Band({ compact, interactive, textureUrl }: BandProps) {
  const fixed = useRef<RapierRigidBody>(null!)
  const firstJoint = useRef<RapierRigidBody>(null!)
  const secondJoint = useRef<RapierRigidBody>(null!)
  const thirdJoint = useRef<RapierRigidBody>(null!)
  const card = useRef<RapierRigidBody>(null!)
  const firstSmoothed = useRef(new THREE.Vector3())
  const secondSmoothed = useRef(new THREE.Vector3())
  const smoothingReady = useRef(false)
  const [dragOffset, setDragOffset] = useState<THREE.Vector3 | null>(null)
  const [hovered, setHovered] = useState(false)
  const [cardTexture, setCardTexture] = useState<THREE.Texture | null>(null)
  const viewportSize = useThree((state) => state.size)

  const pointerPosition = useMemo(() => new THREE.Vector3(), [])
  const pointerDirection = useMemo(() => new THREE.Vector3(), [])
  const angularVelocity = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Vector3(), [])
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3([
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]),
    [],
  )
  const bandGeometry = useMemo(() => new MeshLineGeometry(), [])
  const bandMaterial = useMemo(
    () => new MeshLineMaterial({
      color: "#e9ece8",
      lineWidth: 1,
      resolution: new THREE.Vector2(1000, 1000),
      sizeAttenuation: 1,
    }),
    [],
  )

  const model = useGLTF(CARD_MODEL_URL) as unknown as CardModel

  useRopeJoint(fixed, firstJoint, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(firstJoint, secondJoint, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(secondJoint, thirdJoint, [[0, 0, 0], [0, 0, 0], 1])
  useSphericalJoint(thirdJoint, card, [[0, 0, 0], [0, 1.45, 0]])

  useEffect(() => {
    bandMaterial.resolution.set(viewportSize.width, viewportSize.height)
  }, [bandMaterial, viewportSize])

  useEffect(() => {
    let cancelled = false
    let loadedTexture: THREE.Texture | null = null

    new THREE.TextureLoader().load(
      textureUrl,
      (texture) => {
        if (cancelled) {
          texture.dispose()
          return
        }
        texture.flipY = false
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = compact ? 4 : 8
        loadedTexture = texture
        setCardTexture(texture)
      },
      undefined,
      () => {
        if (!cancelled) setCardTexture(null)
      },
    )

    return () => {
      cancelled = true
      loadedTexture?.dispose()
    }
  }, [compact, textureUrl])

  useEffect(() => {
    document.body.style.cursor = hovered ? (dragOffset ? "grabbing" : "grab") : ""
    return () => {
      document.body.style.cursor = ""
    }
  }, [dragOffset, hovered])

  useEffect(() => () => {
    bandGeometry.dispose()
    bandMaterial.dispose()
  }, [bandGeometry, bandMaterial])

  useFrame((state, delta) => {
    const cardBody = card.current
    const fixedBody = fixed.current
    const firstBody = firstJoint.current
    const secondBody = secondJoint.current
    const thirdBody = thirdJoint.current

    if (!cardBody || !fixedBody || !firstBody || !secondBody || !thirdBody) return

    if (dragOffset) {
      pointerPosition.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera)
      pointerDirection.copy(pointerPosition).sub(state.camera.position).normalize()
      pointerPosition.add(pointerDirection.multiplyScalar(state.camera.position.length()))
      cardBody.setNextKinematicTranslation({
        x: pointerPosition.x - dragOffset.x,
        y: pointerPosition.y - dragOffset.y,
        z: pointerPosition.z - dragOffset.z,
      })
      ;[cardBody, firstBody, secondBody, thirdBody, fixedBody].forEach((body) => body.wakeUp())
    }

    const firstTranslation = firstBody.translation()
    const secondTranslation = secondBody.translation()
    if (!smoothingReady.current) {
      firstSmoothed.current.copy(firstTranslation)
      secondSmoothed.current.copy(secondTranslation)
      smoothingReady.current = true
    }

    const firstDistance = THREE.MathUtils.clamp(firstSmoothed.current.distanceTo(firstTranslation), 0.1, 1)
    const secondDistance = THREE.MathUtils.clamp(secondSmoothed.current.distanceTo(secondTranslation), 0.1, 1)
    firstSmoothed.current.lerp(firstTranslation, delta * firstDistance * 50)
    secondSmoothed.current.lerp(secondTranslation, delta * secondDistance * 50)

    curve.points[0].copy(thirdBody.translation())
    curve.points[1].copy(secondSmoothed.current)
    curve.points[2].copy(firstSmoothed.current)
    curve.points[3].copy(fixedBody.translation())
    bandGeometry.setPoints(curve.getPoints(compact ? 16 : 32))

    angularVelocity.copy(cardBody.angvel())
    rotation.copy(cardBody.rotation())
    cardBody.setAngvel({
      x: angularVelocity.x,
      y: angularVelocity.y - rotation.y * 0.25,
      z: angularVelocity.z,
    }, false)
  })

  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!interactive || !card.current) return
    event.stopPropagation()
    const pointerTarget = event.nativeEvent.target
    if (pointerTarget instanceof Element) pointerTarget.setPointerCapture(event.pointerId)
    const translation = card.current.translation()
    setDragOffset(new THREE.Vector3(
      event.point.x - translation.x,
      event.point.y - translation.y,
      event.point.z - translation.z,
    ))
  }

  const stopDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!interactive) return
    event.stopPropagation()
    const pointerTarget = event.nativeEvent.target
    if (pointerTarget instanceof Element && pointerTarget.hasPointerCapture(event.pointerId)) {
      pointerTarget.releasePointerCapture(event.pointerId)
    }
    setDragOffset(null)
  }

  const segmentProps = {
    angularDamping: 4,
    canSleep: true,
    colliders: false as const,
    linearDamping: 4,
  }

  return (
    <>
      <group position={[0, 4, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody ref={firstJoint} {...segmentProps} position={[0.5, 0, 0]}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody ref={secondJoint} {...segmentProps} position={[1, 0, 0]}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody ref={thirdJoint} {...segmentProps} position={[1.5, 0, 0]}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          ref={card}
          {...segmentProps}
          position={[2, 0, 0]}
          type={dragOffset ? "kinematicPosition" : "dynamic"}
        >
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group
            position={[0, -1.2, -0.05]}
            scale={2.25}
            onPointerDown={startDrag}
            onPointerOut={() => setHovered(false)}
            onPointerOver={() => interactive && setHovered(true)}
            onPointerUp={stopDrag}
          >
            <mesh geometry={model.nodes.card.geometry}>
              <meshPhysicalMaterial
                key={cardTexture?.uuid ?? "credential-pending"}
                clearcoat={compact ? 0 : 1}
                clearcoatRoughness={0.15}
                color={cardTexture ? "white" : "#1b1d1c"}
                map={cardTexture ?? undefined}
                metalness={0.45}
                roughness={0.72}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh geometry={model.nodes.clip.geometry}>
              <meshStandardMaterial color="#b9bcba" metalness={0.9} roughness={0.3} />
            </mesh>
            <mesh geometry={model.nodes.clamp.geometry}>
              <meshStandardMaterial color="#b9bcba" metalness={0.9} roughness={0.24} />
            </mesh>
          </group>
        </RigidBody>
      </group>
      <mesh geometry={bandGeometry} material={bandMaterial} />
    </>
  )
}

useGLTF.preload(CARD_MODEL_URL)
