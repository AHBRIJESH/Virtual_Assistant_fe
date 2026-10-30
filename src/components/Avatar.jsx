import { useAnimations, useFBX, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import React, { useEffect, useRef, useState } from "react";

import * as THREE from "three";

const corresponding = {
  A: "viseme_PP",
  B: "viseme_kk",
  C: "viseme_I",
  D: "viseme_AA",
  E: "viseme_O",
  F: "viseme_U",
  G: "viseme_FF",
  H: "viseme_TH",
  X: "viseme_PP",
};

const fallbackVisemeMap = {
  a: "D",
  e: "C",
  i: "C",
  o: "E",
  u: "F",
  p: "A",
  b: "A",
  m: "A",
  k: "B",
  g: "B",
  q: "B",
  f: "G",
  v: "G",
  s: "H",
  z: "H",
  t: "H",
  d: "H",
  r: "H",
  l: "H",
  n: "H",
  h: "H",
  y: "H",
  j: "H",
  x: "H",
  c: "H",
};

const buildFallbackLipSync = (text, audioDuration = 0) => {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return { mouthCues: [{ start: 0, end: 0.2, value: "X" }] };
  }

  const words = normalized.split(" ");
  const visibleCharacters = normalized.replace(/\s+/g, "").length || 1;
  const charDuration =
    audioDuration > 0
      ? Math.max(0.06, Math.min(0.18, audioDuration / visibleCharacters))
      : 0.12;

  const cues = [];
  let currentTime = 0;

  words.forEach((word, index) => {
    const letters = word.split("");

    letters.forEach((character) => {
      const code = character.toLowerCase();
      const key = fallbackVisemeMap[code] || "C";
      const duration =
        /[aeiou]/i.test(character) ? charDuration * 1.25 : charDuration;
      const start = currentTime;
      const end = currentTime + duration;
      cues.push({ start, end, value: key });
      currentTime = end;
    });

    if (index < words.length - 1) {
      currentTime += 0.08;
    }
  });

  if (audioDuration > 0 && cues.length) {
    const lastCue = cues[cues.length - 1];
    const remainingTime = Math.max(0, audioDuration - lastCue.end);
    if (remainingTime > 0.05) {
      cues.push({ start: lastCue.end, end: lastCue.end + remainingTime, value: "X" });
    }
  }

  if (!cues.length) {
    return { mouthCues: [{ start: 0, end: Math.max(audioDuration, 0.2), value: "X" }] };
  }

  return { mouthCues: cues };
};

const resetMouthPose = (nodes, smooth, smoothing) => {
  const headInfluences = nodes.Wolf3D_Head.morphTargetInfluences;
  const teethInfluences = nodes.Wolf3D_Teeth.morphTargetInfluences;
  const headDictionary = nodes.Wolf3D_Head.morphTargetDictionary;
  const teethDictionary = nodes.Wolf3D_Teeth.morphTargetDictionary;
  const neutralViseme = corresponding.C;

  for (const viseme of new Set(Object.values(corresponding))) {
    const headIndex = headDictionary[viseme];
    const teethIndex = teethDictionary[viseme];
    const restingValue = viseme === neutralViseme ? 1 : 0;

    headInfluences[headIndex] = smooth
      ? THREE.MathUtils.lerp(headInfluences[headIndex], restingValue, smoothing)
      : restingValue;
    teethInfluences[teethIndex] = smooth
      ? THREE.MathUtils.lerp(teethInfluences[teethIndex], restingValue, smoothing)
      : restingValue;
  }
};

export function Avatar(props) {
  const {
    playAudio: externalPlayAudio = false,
    script: externalScript = "output",
    audioUrl: externalAudioUrl = "",
    audioElement: externalAudioElement = null,
    responseText = "",
  } = props;
  const {
    script: levaScript,
    headFollow,
    smoothMorphTarget,
    morphTargetSmoothing,
  } = useControls({
    headFollow: true,
    smoothMorphTarget: true,
    morphTargetSmoothing: 0.5,
    script: {
      value: "output",
    },
  });

  const playAudio = externalPlayAudio;
  const script = externalScript || levaScript;
  const [audio, setAudio] = useState(null);
  const [lipsync, setLipsync] = useState({ mouthCues: [] });

  useEffect(() => {
    if (!externalAudioElement) {
      setAudio(null);
      return undefined;
    }

    const newAudio = externalAudioElement;
    setAudio(newAudio);

    return () => {
      if (newAudio) {
        newAudio.pause();
      }
    };
  }, [externalAudioElement]);

  useEffect(() => {
    let isMounted = true;

    const loadLipsync = async () => {
      if (externalAudioUrl && responseText) {
        const fallback = buildFallbackLipSync(responseText, audio?.duration || 0);
        if (isMounted) {
          setLipsync(fallback);
        }
        return;
      }

      try {
        const response = await fetch(`/audios/${script}.json`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Missing JSON");
        }

        const json = await response.json();
        if (isMounted) {
          setLipsync(json);
        }
      } catch (error) {
        const fallback = buildFallbackLipSync(responseText || "hello there", audio?.duration || 0);
        if (isMounted) {
          setLipsync(fallback);
        }
      }
    };

    loadLipsync();
    return () => {
      isMounted = false;
    };
  }, [script, responseText, externalAudioUrl, audio]);

  useEffect(() => {
    if (!audio || !externalAudioUrl || !responseText) return;

    const updateLipsyncFromAudio = () => {
      setLipsync(buildFallbackLipSync(responseText, audio.duration || 0));
    };

    audio.addEventListener("loadedmetadata", updateLipsyncFromAudio);
    return () => {
      audio.removeEventListener("loadedmetadata", updateLipsyncFromAudio);
    };
  }, [audio, externalAudioUrl, responseText]);

  useFrame(() => {
    if (!audio || audio.paused || audio.ended) {
      resetMouthPose(nodes, smoothMorphTarget, morphTargetSmoothing);
      if (audio) setAnimation("Idle");
      return;
    }

    const currentAudioTime = audio.currentTime;

    Object.values(corresponding).forEach((value) => {
      if (!smoothMorphTarget) {
        nodes.Wolf3D_Head.morphTargetInfluences[
          nodes.Wolf3D_Head.morphTargetDictionary[value]
        ] = 0;
        nodes.Wolf3D_Teeth.morphTargetInfluences[
          nodes.Wolf3D_Teeth.morphTargetDictionary[value]
        ] = 0;
      } else {
        nodes.Wolf3D_Head.morphTargetInfluences[
          nodes.Wolf3D_Head.morphTargetDictionary[value]
        ] = THREE.MathUtils.lerp(
          nodes.Wolf3D_Head.morphTargetInfluences[
            nodes.Wolf3D_Head.morphTargetDictionary[value]
          ],
          0,
          morphTargetSmoothing
        );

        nodes.Wolf3D_Teeth.morphTargetInfluences[
          nodes.Wolf3D_Teeth.morphTargetDictionary[value]
        ] = THREE.MathUtils.lerp(
          nodes.Wolf3D_Teeth.morphTargetInfluences[
            nodes.Wolf3D_Teeth.morphTargetDictionary[value]
          ],
          0,
          morphTargetSmoothing
        );
      }
    });

    for (let i = 0; i < lipsync.mouthCues.length; i++) {
      const mouthCue = lipsync.mouthCues[i];
      if (
        currentAudioTime >= mouthCue.start &&
        currentAudioTime <= mouthCue.end
      ) {
        if (!smoothMorphTarget) {
          nodes.Wolf3D_Head.morphTargetInfluences[
            nodes.Wolf3D_Head.morphTargetDictionary[
              corresponding[mouthCue.value]
            ]
          ] = 1;
          nodes.Wolf3D_Teeth.morphTargetInfluences[
            nodes.Wolf3D_Teeth.morphTargetDictionary[
              corresponding[mouthCue.value]
            ]
          ] = 1;
        } else {
          nodes.Wolf3D_Head.morphTargetInfluences[
            nodes.Wolf3D_Head.morphTargetDictionary[
              corresponding[mouthCue.value]
            ]
          ] = THREE.MathUtils.lerp(
            nodes.Wolf3D_Head.morphTargetInfluences[
              nodes.Wolf3D_Head.morphTargetDictionary[
                corresponding[mouthCue.value]
              ]
            ],
            1,
            morphTargetSmoothing
          );
          nodes.Wolf3D_Teeth.morphTargetInfluences[
            nodes.Wolf3D_Teeth.morphTargetDictionary[
              corresponding[mouthCue.value]
            ]
          ] = THREE.MathUtils.lerp(
            nodes.Wolf3D_Teeth.morphTargetInfluences[
              nodes.Wolf3D_Teeth.morphTargetDictionary[
                corresponding[mouthCue.value]
              ]
            ],
            1,
            morphTargetSmoothing
          );
        }

        break;
      }
    }
  });

  useEffect(() => {
    if (!audio) return;
    if (externalAudioElement && audio !== externalAudioElement) return;
  
    nodes.Wolf3D_Head.morphTargetInfluences[
      nodes.Wolf3D_Head.morphTargetDictionary["viseme_I"]
    ] = 1;
    nodes.Wolf3D_Teeth.morphTargetInfluences[
      nodes.Wolf3D_Teeth.morphTargetDictionary["viseme_I"]
    ] = 1;
  
    if (playAudio) {
      if (script === "welcome") {
        setAnimation("Greeting");
      } else {
        setAnimation("Angry");
      }
    } else {
      audio.pause();
      setAnimation("Idle");
    }
  }, [playAudio, audio, script, externalAudioElement]);
  

  const { nodes, materials } = useGLTF("/models/646d9dcdc8a5f5bddbfac913.glb");
  const { animations: idleAnimation } = useFBX("/animations/Idle.fbx");
  const { animations: angryAnimation } = useFBX(
    "/animations/Angry Gesture.fbx"
  );
  const { animations: greetingAnimation } = useFBX(
    "/animations/Standing Greeting.fbx"
  );

  idleAnimation[0].name = "Idle";
  angryAnimation[0].name = "Angry";
  greetingAnimation[0].name = "Greeting";

  const [animation, setAnimation] = useState("Idle");

  const group = useRef();
  const { actions } = useAnimations(
    [idleAnimation[0], angryAnimation[0], greetingAnimation[0]],
    group
  );

  useEffect(() => {
    actions[animation].reset().fadeIn(0.5).play();
    return () => actions[animation].fadeOut(0.5);
  }, [animation]);

  // CODE ADDED AFTER THE TUTORIAL (but learnt in the portfolio tutorial ♥️)
  useFrame((state) => {
    if (headFollow) {
      group.current.getObjectByName("Head").lookAt(state.camera.position);
    }
  });

  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips} />
      <skinnedMesh
        geometry={nodes.Wolf3D_Body.geometry}
        material={materials.Wolf3D_Body}
        skeleton={nodes.Wolf3D_Body.skeleton}
      />
      <skinnedMesh
        geometry={nodes.Wolf3D_Outfit_Bottom.geometry}
        material={materials.Wolf3D_Outfit_Bottom}
        skeleton={nodes.Wolf3D_Outfit_Bottom.skeleton}
      />
      <skinnedMesh
        geometry={nodes.Wolf3D_Outfit_Footwear.geometry}
        material={materials.Wolf3D_Outfit_Footwear}
        skeleton={nodes.Wolf3D_Outfit_Footwear.skeleton}
      />
      <skinnedMesh
        geometry={nodes.Wolf3D_Outfit_Top.geometry}
        material={materials.Wolf3D_Outfit_Top}
        skeleton={nodes.Wolf3D_Outfit_Top.skeleton}
      />
      <skinnedMesh
        geometry={nodes.Wolf3D_Hair.geometry}
        material={materials.Wolf3D_Hair}
        skeleton={nodes.Wolf3D_Hair.skeleton}
      />
      <skinnedMesh
        name="EyeLeft"
        geometry={nodes.EyeLeft.geometry}
        material={materials.Wolf3D_Eye}
        skeleton={nodes.EyeLeft.skeleton}
        morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary}
        morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences}
      />
      <skinnedMesh
        name="EyeRight"
        geometry={nodes.EyeRight.geometry}
        material={materials.Wolf3D_Eye}
        skeleton={nodes.EyeRight.skeleton}
        morphTargetDictionary={nodes.EyeRight.morphTargetDictionary}
        morphTargetInfluences={nodes.EyeRight.morphTargetInfluences}
      />
      <skinnedMesh
        name="Wolf3D_Head"
        geometry={nodes.Wolf3D_Head.geometry}
        material={materials.Wolf3D_Skin}
        skeleton={nodes.Wolf3D_Head.skeleton}
        morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary}
        morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences}
      />
      <skinnedMesh
        name="Wolf3D_Teeth"
        geometry={nodes.Wolf3D_Teeth.geometry}
        material={materials.Wolf3D_Teeth}
        skeleton={nodes.Wolf3D_Teeth.skeleton}
        morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary}
        morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences}
      />
    </group>
  );
}

useGLTF.preload("/models/646d9dcdc8a5f5bddbfac913.glb");
