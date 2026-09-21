import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { codeFor, createDocument, editor, emailFor, invite, joinAsInvited, typeInEditor } from "./helpers.js";

// Automated WCAG 2.x A/AA scan (04-UIUX.md §10) of every screen a person can
// reach, in both colour schemes — contrast bugs often exist in only one. axe
// can't judge everything (focus order and screen-reader wording still need a
// human), but it reliably catches missing names/labels, bad roles/ARIA and
// contrast, which are exactly what silently regress.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page, screen: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const report = violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.help} — ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
  // Soft: one run reports every screen's problems instead of stopping at the first.
  expect.soft(report, `${screen}: accessibility violations`).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`Accessibility (${colorScheme}): every screen passes an axe WCAG 2.x A/AA scan`, async ({ browser }) => {
    const aliceContext = await browser.newContext({ colorScheme });
    const alice = await aliceContext.newPage();
    const aliceEmail = emailFor("Alice");

    // Sign-in, in each of its states.
    await alice.goto("/login");
    await expect(alice.getByRole("heading", { name: "Log in or sign up" })).toBeVisible();
    await scan(alice, "sign-in");

    await alice.getByLabel("Email", { exact: true }).fill("not-an-email");
    await alice.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(alice.getByText("Enter a valid email address.")).toBeVisible();
    await scan(alice, "sign-in with a validation error");

    await alice.getByLabel("Email", { exact: true }).fill(aliceEmail);
    await alice.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(alice.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await scan(alice, "code entry");

    const realCode = await codeFor(alice, aliceEmail);
    await alice.getByLabel("Verification code").fill(realCode === "000000" ? "111111" : "000000");
    await expect(alice.getByText("That code is incorrect or has expired.")).toBeVisible();
    await scan(alice, "code entry with a wrong-code error");

    await alice.getByLabel("Verification code").fill(realCode);
    await expect(alice.getByRole("heading", { name: /What should we call you/ })).toBeVisible();
    await scan(alice, "name step");
    await alice.getByLabel("Your name").fill("Alice");
    await alice.getByRole("button", { name: "Continue", exact: true }).click();

    // Dashboard.
    await expect(alice.getByRole("button", { name: "New document" }).first()).toBeVisible();
    await scan(alice, "dashboard (empty)");

    // Editor, with real content, then with a collaborator present.
    await createDocument(alice);
    await typeInEditor(alice, "Accessibility check.");
    await scan(alice, "editor");

    await alice.getByRole("button", { name: "Export" }).click();
    await expect(alice.getByRole("button", { name: "Download as Markdown (.md)" })).toBeVisible();
    await scan(alice, "editor with the export menu open");
    await alice.keyboard.press("Escape");

    await invite(alice, emailFor("Bob"));
    await scan(alice, "share dialog");
    await alice.keyboard.press("Escape");

    const bob = await joinAsInvited(browser, "Bob", { colorScheme });
    await editor(bob.page).click();
    // Bob's caret label is now rendered in Alice's editor: colored text on a
    // per-user background, the likeliest place for a contrast regression.
    await expect(alice.locator(".collaboration-cursor__label", { hasText: "Bob" })).toBeVisible();
    await scan(alice, "editor with a collaborator's caret");

    await alice.getByRole("button", { name: "History" }).click();
    await expect(alice.getByRole("dialog", { name: "Version history" })).toBeVisible();
    await scan(alice, "version history panel");
    await alice.keyboard.press("Escape");

    await alice.getByRole("button", { name: "Back to Dashboard" }).click();
    await expect(alice.getByRole("button", { name: /Untitled document/ }).first()).toBeVisible();
    await scan(alice, "dashboard (with a document)");

    await alice.getByRole("button", { name: "Account menu" }).click();
    await expect(alice.getByRole("button", { name: "Log out" })).toBeVisible();
    await scan(alice, "dashboard with the account menu open");

    // Not-found.
    await alice.goto("/no/such/page");
    await expect(alice.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await scan(alice, "not found");

    await aliceContext.close();
    await bob.context.close();
  });
}
