"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function errorRedirect(
  message: string,
  mode?: "signup",
  code?: string | null
): never {
  const details = code ? `${message} [${code}]` : message;
  const params = new URLSearchParams({ error: details });

  if (mode) {
    params.set("mode", mode);
  }

  redirect(`/login?${params.toString()}`);
}

function successRedirect(message: string, mode?: "signup"): never {
  const params = new URLSearchParams({ success: message });

  if (mode) {
    params.set("mode", mode);
  }

  redirect(`/login?${params.toString()}`);
}

export async function login(formData: FormData) {
  const email = getText(formData, "email").toLowerCase();
  const password = getText(formData, "password");

  if (!email || !password) {
    errorRedirect("Wpisz e-mail i hasło.");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("[ASARVO AUTH][LOGIN]", {
      message: error.message,
      code: error.code,
      status: error.status,
    });

    errorRedirect(error.message, undefined, error.code);
  }

  revalidatePath("/", "layout");
  redirect("/account");
}

export async function signup(formData: FormData) {
  const displayName = getText(formData, "displayName").slice(0, 80);
  const email = getText(formData, "email").toLowerCase();
  const password = getText(formData, "password");

  if (!email) {
    errorRedirect("Wpisz poprawny adres e-mail.", "signup");
  }

  if (password.length < 6) {
    errorRedirect("Hasło musi mieć co najmniej 6 znaków.", "signup");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || email.split("@")[0],
      },
    },
  });

  if (error) {
    console.error("[ASARVO AUTH][SIGNUP]", {
      message: error.message,
      code: error.code,
      status: error.status,
    });

    errorRedirect(error.message, "signup", error.code);
  }

  /*
   * Gdy potwierdzanie adresu e-mail jest włączone w Supabase,
   * brak sesji bezpośrednio po signUp jest prawidłowym zachowaniem.
   * Użytkownik musi najpierw kliknąć link potwierdzający w wiadomości.
   */
  if (!data.session) {
    successRedirect(
      "Konto zostało utworzone. Sprawdź skrzynkę e-mail i kliknij link potwierdzający.",
      "signup"
    );
  }

  /*
   * Ten wariant zostawiamy również na wypadek,
   * gdyby w przyszłości potwierdzanie e-maila zostało wyłączone.
   */
  revalidatePath("/", "layout");
  redirect("/account");
}