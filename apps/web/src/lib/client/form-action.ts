import { deserialize } from '$app/forms';

export async function submitAction(
  action: string,
  data: Record<string, string | null | undefined>,
) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (value != null && value !== '') fd.set(key, value);
  }
  const res = await fetch(`?/${action}`, { method: 'POST', body: fd });
  return deserialize(await res.text());
}
