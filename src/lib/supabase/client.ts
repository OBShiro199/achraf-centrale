import { createBrowserClient } from "@supabase/ssr";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export function createClient() {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
  );
}

/** Invokes an edge function and surfaces its `{ error }` body as a readable Error. */
export async function callFunction<T>(name: string, body: unknown = {}): Promise<T> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? "Something went wrong");
    }
    throw new Error(error.message);
  }
  return data as T;
}
