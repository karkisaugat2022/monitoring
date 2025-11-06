export async function onRequestGet({ env }) {
  const value = await env.monitoring.get("temperature");
  return new Response(`Temperature: ${value || "No data stored"}`);
}

export async function onRequestPost({ request, env }) {
  const { key, value } = await request.json();
  await env.monitoring.put(key, value);
  return new Response(`Stored ${key} = ${value}`);
}
