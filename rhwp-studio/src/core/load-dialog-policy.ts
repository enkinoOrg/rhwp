export type ValidationDialogAction = 'none' | 'prompt';

export function validationDialogAction(
  sourceFormat: string,
  warningCount: number,
  suppressDialogs: unknown,
): ValidationDialogAction {
  return sourceFormat === 'hwpx' && warningCount > 0 && suppressDialogs !== true
    ? 'prompt'
    : 'none';
}
