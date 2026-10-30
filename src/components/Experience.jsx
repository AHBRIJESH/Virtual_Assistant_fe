import { Environment, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useState } from "react";
import { Avatar } from "./Avatar";
import VoiceAssistant from "./VoiceAssistant";

export const Experience = () => {
  const texture = useTexture("textures/bg.jpg");
  const viewport = useThree((state) => state.viewport);
  const [avatarSpeech, setAvatarSpeech] = useState({
    playAudio: false,
    script: "output",
    audioUrl: "",
    audioElement: null,
    responseText: "",
  });

  return (
    <>
      <Avatar
        position={[0, -11.2, 0]}
        scale={7.4}
        playAudio={avatarSpeech.playAudio}
        script={avatarSpeech.script}
        audioUrl={avatarSpeech.audioUrl}
        audioElement={avatarSpeech.audioElement}
        responseText={avatarSpeech.responseText}
      />
      <Environment preset="sunset" />
      <mesh>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial map={texture} />
      </mesh>
      <VoiceAssistant onAvatarSpeak={setAvatarSpeech} />
    </>
  );
};
