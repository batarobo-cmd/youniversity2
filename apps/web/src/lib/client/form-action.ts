import { deserialize, type ActionResult } from '$app/forms';

export async function submitAction(
  action: string,
  data: Record<string, string | null | undefined>,
): Promise<ActionResult> {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (value != null && value !== '') fd.set(key, value);
  }

  const res = await fetch(`?/${action}`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'x-sveltekit-action': 'true',
    },
  });

  return deserialize(await res.text());
}

export function actionErrorMessage(result: ActionResult): string | null {
  if (result.type === 'success') return null;
  if (result.type === 'failure') {
    return String((result.data as { error?: string } | undefined)?.error ?? 'Chyba');
  }
  if (result.type === 'redirect') {
    return 'Relácia vypršala. Prihláste sa znova.';
  }
  if (result.type === 'error') {
    return result.error?.message ?? 'Neočakávaná chyba servera.';
  }
  return 'Operácia zlyhala.';
}

export function isActionSuccess(result: ActionResult): boolean {
  return result.type === 'success';
}
