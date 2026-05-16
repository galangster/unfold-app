declare module '*.svg' {
  import { SvgProps } from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}

declare module '*.mp3' {
  const value: number;
  export default value;
}

declare module '*.wav' {
  const value: number;
  export default value;
}

declare module '*.riv' {
  const value: number;
  export default value;
}
