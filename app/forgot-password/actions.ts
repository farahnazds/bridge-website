"use server";

import { createClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/site";

export interface ForgotPasswordState {
  sent: boolean;
  error: string | null;
}

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { sent: false, error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const baseUrl = await getBaseUrl();

  // Result is intentionally ignored — always report success below so this
  // can't be used to enumerate which emails have Bridgetx accounts.
  //
  // The email template links {{ .TokenHash }} → /auth/confirm rather than
  // {{ .ConfirmationURL }}, so the reset works when requested on one device
  // and opened on another (ConfirmationURL runs the PKCE flow, which only
  // the requesting browser can complete). redirectTo stays set as the
  // fallback destination should the template ever revert to ConfirmationURL.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}/reset-password`,
  });

  return { sent: true, error: null };
}
