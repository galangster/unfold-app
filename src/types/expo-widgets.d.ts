declare module '@expo/ui/swift-ui' {
  export const Text: any;
  export const VStack: any;
  export const HStack: any;
  export const Image: any;
  export const Spacer: any;
  export const Button: any;
  export const List: any;
  export const ForEach: any;
  export const Color: any;
  export const ZStack: any;
  export const Divider: any;
  export const Link: any;
  export const Gauge: any;
  export const ProgressView: any;
  export const Chart: any;
}

declare module '@expo/ui/swift-ui/modifiers' {
  export function font(options: { weight?: string; size?: number; design?: string }): any;
  export function foregroundStyle(color: string): any;
  export function background(color: string): any;
  export function padding(value: number): any;
  export function cornerRadius(value: number): any;
  export function shadow(options: { color?: string; radius?: number; x?: number; y?: number }): any;
  export function frame(options: { width?: number; height?: number }): any;
}

declare module 'expo-widgets' {
  export interface WidgetBase<T> {
    count?: number;
    [key: string]: any;
  }
}
