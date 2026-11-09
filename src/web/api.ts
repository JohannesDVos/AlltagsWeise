export class ApiError extends Error {
  constructor(readonly status:number,message:string) { super(message); }
}
export async function api<T = void>(path:string, method='GET', body?:unknown):Promise<T> {
  const response = await fetch('/api/v1'+path,{
    method,cache:'no-store',
    ...(body === undefined ? {} : {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  });
  if (response.status === 204) return undefined as T;
  const data:unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string' ? data.message : 'Der Server ist gerade nicht erreichbar.';
    throw new ApiError(response.status,message);
  }
  if (data === null) throw new Error('Der Server hat keine lesbare Antwort gesendet.');
  return data as T;
}
export const messageFor = (error:unknown) => error instanceof ApiError ? error.message : 'Die Verbindung ist unterbrochen. Bitte versuche es erneut.';
