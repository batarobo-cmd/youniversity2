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

export async function queryApi<T = unknown>(
  action: string,
  path: string,
): Promise<{ data: T | null; error: string | null }> {
  const result = await submitAction(action, { path });
  const err = actionErrorMessage(result);
  if (!isActionSuccess(result) || err) {
    return { data: null, error: err ?? 'Operácia zlyhala.' };
  }
  const data = (result.data as { data?: T } | undefined)?.data ?? null;
  return { data, error: null };
}

export async function mutateApi(
  action: string,
  path: string,
  method = 'POST',
  body?: unknown,
): Promise<{ ok: boolean; error: string | null }> {
  const fields: Record<string, string> = { path, method };
  if (body !== undefined) fields.body = JSON.stringify(body);
  const result = await submitAction(action, fields);
  const err = actionErrorMessage(result);
  if (!isActionSuccess(result) || err) {
    return { ok: false, error: err ?? 'Operácia zlyhala.' };
  }
  return { ok: true, error: null };
}

export async function serverMutate(
  action: string,
  path: string,
  method = 'POST',
  body?: unknown,
): Promise<void> {
  const { ok, error } = await mutateApi(action, path, method, body);
  if (!ok) throw new Error(error ?? 'Operácia zlyhala.');
}
