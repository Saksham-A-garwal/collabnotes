import { expect, test } from "@playwright/test";
import { codeFor, emailFor, newUser, signIn } from "./helpers.js";

test("Sign in with an emailed code: new account, sign out, returning user", async ({ browser }) => {
  const { context, page } = await newUser(browser);
  const email = emailFor("Zoe");

  await page.goto("/login");
  await signIn(page, email, { name: "Zoe Quinn" });
  await expect(page.getByRole("heading", { name: /Zoe/ })).toBeVisible();
  await expect(page).toHaveTitle(/Documents/);

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, email);
  await expect(page.getByRole("heading", { name: /Zoe/ })).toBeVisible();

  await context.close();
});

test("A wrong code is refused with a clear message and you can try again", async ({ browser }) => {
  const { context, page } = await newUser(browser);
  const email = emailFor("Wren");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(email)).toBeVisible();

  const real = await codeFor(page, email);
  const wrong = real === "000000" ? "111111" : "000000";
  await page.getByLabel("Verification code").fill(wrong);
  await expect(page.getByRole("alert")).toContainText("incorrect or has expired");
  await expect(page.getByLabel("Verification code")).toHaveValue("");

  await page.getByLabel("Verification code").fill(real);
  await expect(page.getByLabel("Your name")).toBeVisible();
  await context.close();
});

test("Resending a code invalidates the old one; 'use a different email' goes back", async ({ browser }) => {
  const { context, page } = await newUser(browser);
  const email = emailFor("Rae");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const first = await codeFor(page, email);

  await page.getByRole("button", { name: "Resend code" }).click();
  await expect(page.getByText(`We sent a new code to ${email}`)).toBeVisible();
  const second = await codeFor(page, email);

  if (first !== second) {
    await page.getByLabel("Verification code").fill(first);
    await expect(page.getByRole("alert")).toContainText("incorrect or has expired");
  }
  await page.getByLabel("Verification code").fill(second);
  await expect(page.getByLabel("Your name")).toBeVisible();
  await context.close();

  const other = await newUser(browser);
  await other.page.goto("/login");
  await other.page.getByLabel("Email", { exact: true }).fill(emailFor("Rae2"));
  await other.page.getByRole("button", { name: "Continue", exact: true }).click();
  await other.page.getByRole("button", { name: "Use a different email" }).click();
  await expect(other.page.getByRole("heading", { name: "Log in or sign up" })).toBeVisible();
  await other.context.close();
});

test("A Google callback this browser didn't start is refused (OAuth state / login CSRF)", async ({ browser }) => {
  const { context, page } = await newUser(browser);
  await page.goto("/oauth/google/callback?code=attackers-code&state=forged");
  await expect(page.getByRole("alert")).toContainText("isn't valid or has expired");
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(page.getByRole("heading", { name: "Log in or sign up" })).toBeVisible();
  await context.close();
});

test("An open-redirect attempt in ?redirect= lands on the dashboard, not another site", async ({ browser }) => {
  const { context, page } = await newUser(browser);
  await page.goto("/login?redirect=" + encodeURIComponent("/\\evil.example"));
  await signIn(page, emailFor("Kit"), { name: "Kit" });
  await expect(page).toHaveURL(/^http:\/\/localhost:5173\/$/);
  await context.close();
});
