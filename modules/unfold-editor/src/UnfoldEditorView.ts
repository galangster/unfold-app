import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';

export type UnfoldEditorViewProps = ViewProps;

export default requireNativeView<UnfoldEditorViewProps>('UnfoldEditor');
