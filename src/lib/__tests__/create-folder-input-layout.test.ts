import { getCreateFolderInputLayout } from '../create-folder-input-layout';

describe('create folder input layout', () => {
  it('uses centered single-line metrics so placeholder text sits vertically centered', () => {
    expect(getCreateFolderInputLayout()).toEqual({
      height: 48,
      paddingVertical: 0,
      textAlignVertical: 'center',
    });
  });
});
