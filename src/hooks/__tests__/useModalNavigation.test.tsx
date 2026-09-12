import React from 'react';
import { Platform } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { useModalNavigation } from '../useModalNavigation';

let controller: ReturnType<typeof useModalNavigation>;
function Probe({ visible, hide }: { visible: boolean; hide: () => void }) {
  controller = useModalNavigation(visible, hide);
  return null;
}

afterEach(() => jest.restoreAllMocks());

it('waits for iOS native dismissal before navigating, then runs once', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const hide = jest.fn();
  const navigate = jest.fn();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Probe visible hide={hide} />); });
  await act(async () => { controller.navigateAfterDismiss(navigate); });
  expect(hide).toHaveBeenCalledTimes(1);
  await act(async () => { tree!.update(<Probe visible={false} hide={hide} />); });
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => { controller.onDismiss(); controller.onDismiss(); });
  expect(navigate).toHaveBeenCalledTimes(1);
  await act(async () => { tree!.unmount(); });
});

it('waits for the hidden Android modal commit without an iOS dismissal event', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const hide = jest.fn();
  const navigate = jest.fn();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Probe visible hide={hide} />); });
  await act(async () => { controller.navigateAfterDismiss(navigate); });
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => { tree!.update(<Probe visible={false} hide={hide} />); });
  expect(navigate).toHaveBeenCalledTimes(1);
  await act(async () => { tree!.unmount(); });
});

it('cancels pending navigation when the owning screen unmounts', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const navigate = jest.fn();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Probe visible hide={jest.fn()} />); });
  await act(async () => { controller.navigateAfterDismiss(navigate); tree!.unmount(); });
  controller.onDismiss();
  expect(navigate).not.toHaveBeenCalled();
});
