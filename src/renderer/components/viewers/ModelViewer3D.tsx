import React, { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../../store/appStore';

interface ModelViewer3DProps {
  filePath: string;
}

interface BrepFace {
  first: number;
  last: number;
  color: [number, number, number] | null;
}

interface ParsedMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  color?: [number, number, number];
  brepFaces?: BrepFace[];
}

export function ModelViewer3D({ filePath }: ModelViewer3DProps) {
  const fileName = filePath.split(/[/\\]/).pop() || 'Unknown';
  const [meshes, setMeshes] = useState<ParsedMesh[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('Initializing...');
  const setGlobalProgress = useAppStore(s => s.setGlobalProgress);
  const theme = useAppStore(s => s.theme);
  const [exposure, setExposure] = useState(1.5);

  useEffect(() => {
    let cancelled = false;

    const updateProgress = (msg: string) => {
      setProgress(msg);
      if (msg) {
        setGlobalProgress({ message: `3D: ${msg}`, indeterminate: true });
      }
    };

    (async () => {
      try {
        setLoading(true);
        setError(null);
        updateProgress('Reading file...');

        // Read file as base64 via IPC
        const base64 = await window.api.readFileBase64(filePath);
        if (cancelled) return;

        // Convert base64 to Uint8Array
        const binary = atob(base64);
        const fileBuffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          fileBuffer[i] = binary.charCodeAt(i);
        }

        updateProgress('Loading STEP parser...');

        // Load WASM binary via IPC to bypass MIME type issues with dev server
        const wasmBase64 = await window.api.getWasmBinary('occt-import-js');
        if (cancelled) return;
        const wasmBinary = Uint8Array.from(atob(wasmBase64), c => c.charCodeAt(0)).buffer;

        // Dynamic import to handle WASM loading
        const occtModule = await import('occt-import-js');
        const occtInit = occtModule.default;
        if (cancelled) return;

        updateProgress('Initializing OCCT...');
        const occt = await occtInit({
          wasmBinary,
        });
        if (cancelled) return;

        updateProgress('Parsing STEP file...');
        const result = occt.ReadStepFile(fileBuffer, null);
        if (cancelled) return;

        if (!result.success) {
          setError('Failed to parse STEP file');
          return;
        }

        // Convert OCCT result to our mesh format
        const parsedMeshes: ParsedMesh[] = [];
        for (let i = 0; i < result.meshes.length; i++) {
          const mesh = result.meshes[i];
          const positions = new Float32Array(mesh.attributes.position.array);
          const normals = mesh.attributes.normal
            ? new Float32Array(mesh.attributes.normal.array)
            : new Float32Array(positions.length);
          const indices = new Uint32Array(mesh.index.array);
          // occt-import-js colors are already in 0-1 range
          const color = mesh.color
            ? [mesh.color[0], mesh.color[1], mesh.color[2]] as [number, number, number]
            : undefined;
          // Per-face colors from brep_faces
          const brepFaces: BrepFace[] | undefined = mesh.brep_faces?.length
            ? mesh.brep_faces.map((f: any) => ({
                first: f.first,
                last: f.last,
                color: f.color ? [f.color[0], f.color[1], f.color[2]] as [number, number, number] : null,
              }))
            : undefined;
          parsedMeshes.push({ positions, normals, indices, color, brepFaces });
        }

        if (cancelled) return;
        setMeshes(parsedMeshes);
        setProgress('');
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setGlobalProgress(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      setGlobalProgress(null);
    };
  }, [filePath, setGlobalProgress]);

  return (
    <div className="viewer-container">
      <div className="toolbar">
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '0 8px' }}>
          3D Viewer — {fileName}
          {meshes.length > 0 && ` (${meshes.length} mesh${meshes.length !== 1 ? 'es' : ''})`}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Belichtung</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={exposure}
            onChange={(e) => setExposure(parseFloat(e.target.value))}
            style={{ width: '80px', accentColor: 'var(--accent-blue)' }}
          />
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', minWidth: '28px' }}>
            {exposure.toFixed(1)}
          </span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '0 8px' }}>
          Scroll to zoom, drag to rotate, right-click to pan
        </span>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        {loading ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: '12px', color: 'var(--text-muted)',
          }}>
            <div className="spinner" />
            <span>{progress}</span>
          </div>
        ) : error ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: '12px', color: 'var(--text-muted)',
          }}>
            <p>Failed to load 3D model</p>
            <p style={{ fontSize: '12px', opacity: 0.7, maxWidth: 400, textAlign: 'center' }}>{error}</p>
          </div>
        ) : (
          <Canvas
            camera={{ fov: 45, near: 0.01, far: 100000 }}
            style={{ background: theme === 'dark' ? '#11111b' : '#dce0e8' }}
          >
            <Suspense fallback={null}>
              <Scene3D meshes={meshes} theme={theme} exposure={exposure} />
            </Suspense>
          </Canvas>
        )}
      </div>
    </div>
  );
}

function Scene3D({ meshes, theme, exposure }: { meshes: ParsedMesh[]; theme: 'dark' | 'light'; exposure: number }) {
  const groupRef = useRef<THREE.Group>(null);

  // Calculate bounding box and auto-fit camera
  const { center, size } = useMemo(() => {
    const box = new THREE.Box3();
    for (const mesh of meshes) {
      for (let i = 0; i < mesh.positions.length; i += 3) {
        box.expandByPoint(new THREE.Vector3(
          mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]
        ));
      }
    }
    const c = new THREE.Vector3();
    box.getCenter(c);
    const s = new THREE.Vector3();
    box.getSize(s);
    return { center: c, size: Math.max(s.x, s.y, s.z) || 1 };
  }, [meshes]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6 * exposure} />
      <directionalLight position={[size, size * 2, size]} intensity={1.0 * exposure} />
      <directionalLight position={[-size, -size * 0.5, size * 0.8]} intensity={0.5 * exposure} />
      <directionalLight position={[-size * 0.5, size, -size]} intensity={0.4 * exposure} />
      <hemisphereLight args={[theme === 'dark' ? '#b1e1ff' : '#ffffff', theme === 'dark' ? '#44475a' : '#e6e9ef', 0.4 * exposure]} />

      {/* Controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.5}
        zoomSpeed={1.2}
        panSpeed={0.8}
        target={center}
      />

      {/* Camera auto-position */}
      <CameraPositioner center={center} size={size} />

      {/* Grid */}
      <Grid
        args={[size * 4, size * 4]}
        cellSize={size / 20}
        cellThickness={0.5}
        cellColor={theme === 'dark' ? '#313244' : '#bcc0cc'}
        sectionSize={size / 4}
        sectionThickness={1}
        sectionColor={theme === 'dark' ? '#45475a' : '#9ca0b0'}
        fadeDistance={size * 4}
        position={[center.x, center.y - size / 2 - 0.01, center.z]}
      />

      {/* Meshes */}
      <group ref={groupRef}>
        {meshes.map((mesh, i) => (
          <StepMesh key={i} mesh={mesh} />
        ))}
      </group>
    </>
  );
}

function CameraPositioner({ center, size }: { center: THREE.Vector3; size: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const dist = size * 2.5;
    camera.position.set(
      center.x + dist * 0.6,
      center.y + dist * 0.4,
      center.z + dist * 0.6
    );
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [center, size, camera]);
  return null;
}

function StepMesh({ mesh }: { mesh: ParsedMesh }) {
  const hasFaceColors = mesh.brepFaces?.some(f => f.color != null) ?? false;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    if (mesh.normals.length > 0) {
      geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    } else {
      geo.computeVertexNormals();
    }
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

    // Check if normals are all zero -> recompute
    let allZero = true;
    for (let i = 0; i < mesh.normals.length; i++) {
      if (mesh.normals[i] !== 0) { allZero = false; break; }
    }
    if (allZero) {
      geo.computeVertexNormals();
    }

    // Apply per-face vertex colors from brep_faces if available
    if (hasFaceColors && mesh.brepFaces) {
      const vertexCount = mesh.positions.length / 3;
      const colors = new Float32Array(vertexCount * 3);
      // Default: use mesh-level color or neutral gray
      const defaultR = mesh.color?.[0] ?? 0.7;
      const defaultG = mesh.color?.[1] ?? 0.7;
      const defaultB = mesh.color?.[2] ?? 0.75;
      for (let i = 0; i < vertexCount; i++) {
        colors[i * 3] = defaultR;
        colors[i * 3 + 1] = defaultG;
        colors[i * 3 + 2] = defaultB;
      }
      // Assign per-face colors: each face spans triangle indices [first..last]
      for (const face of mesh.brepFaces) {
        const fc = face.color ?? [defaultR, defaultG, defaultB];
        for (let tri = face.first; tri <= face.last; tri++) {
          for (let v = 0; v < 3; v++) {
            const idx = mesh.indices[tri * 3 + v];
            if (idx !== undefined) {
              colors[idx * 3] = fc[0];
              colors[idx * 3 + 1] = fc[1];
              colors[idx * 3 + 2] = fc[2];
            }
          }
        }
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    return geo;
  }, [mesh, hasFaceColors]);

  const color = mesh.color
    ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2])
    : new THREE.Color(0.7, 0.7, 0.75);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={hasFaceColors ? '#ffffff' : color}
        vertexColors={hasFaceColors}
        roughness={0.4}
        metalness={0.3}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
