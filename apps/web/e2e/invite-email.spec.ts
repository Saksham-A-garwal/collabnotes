import { expect, test } from "@playwright/test";
import {
  createDocument,
  emailTo,
  emailFor,
  expectDocText,
  newUser,
  registerFromScratch,
  shareButton,
  shareDialog,
  signIn,
  typeInEditor,
} from "./helpers.js";

// "Notify by email" on the Share dialog. The API's in-memory outbox stands in
// for the inbox, so the whole journey runs for real: invite -> email -> click
// the link while signed out -> sign in -> land on the document.

async function openShare(page: import("@playwright/test").Page) {
  await shareButton(page).click();
  return shareDialog(page);
}

test("Invite with 'Notify by email' ticked: they're emailed, and the link takes them to the document after sign-in", async ({ browser }) => {
  const alice = await newUser(browser);
  await registerFromScratch(alice.page, "Alice Jones", { email: emailFor("Alice") });
  await createDocument(alice.page);
  await typeInEditor(alice.page, "Draft for Bob.");

  const dialog = await openShare(alice.page);
  await expect(dialog.getByLabel("Notify by email")).toBeChecked(); // on by default
  const bobEmail = emailFor("Bob");
  await dialog.getByLabel("Invite by email").fill(bobEmail);
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "Invitation emailed" })).toBeVisible();
  await expect(dialog.getByText("(pending)")).toBeVisible();

  const mail = await emailTo(alice.page, bobEmail);
  expect(mail).not.toBeNull();
  expect(mail!.subject).toContain("Alice Jones invited you to");
  const link = /Open it: (\S+)/.exec(mail!.text)?.[1];
  expect(link).toMatch(/\/documents\/[0-9a-f-]{36}$/);

  // Bob, signed out, follows the link from the email.
  const bob = await newUser(browser);
  await bob.page.goto(link!);
  await expect(bob.page).toHaveURL(/\/login\?redirect=/); // sent to sign in, remembering where he was going
  await signIn(bob.page, bobEmail, { name: "Bob Smith" });

  // ...and ends up on the document itself, with the pending invite turned into real access.
  await expect(bob.page).toHaveURL(link!);
  await expectDocText(bob.page, "Draft for Bob.");

  await alice.context.close();
  await bob.context.close();
});

test("Unticking the box shares quietly: access is granted, nothing is emailed", async ({ browser }) => {
  const alice = await newUser(browser);
  await registerFromScratch(alice.page, "Alice Jones", { email: emailFor("Alice") });
  await createDocument(alice.page);

  const dialog = await openShare(alice.page);
  const quietEmail = emailFor("Quiet");
  await dialog.getByLabel("Notify by email").uncheck();
  await dialog.getByLabel("Invite by email").fill(quietEmail);
  await dialog.getByRole("button", { name: "Send" }).click();

  await expect(dialog.getByRole("status")).toContainText("Shared with");
  await expect(dialog.getByRole("status")).toContainText("next time they sign in");
  await expect(dialog.getByText("(pending)")).toBeVisible();
  expect(await emailTo(alice.page, quietEmail)).toBeNull();

  await alice.context.close();
});

test("Inviting someone who already has exactly this access says so, instead of emailing again", async ({ browser }) => {
  const alice = await newUser(browser);
  await registerFromScratch(alice.page, "Alice Jones", { email: emailFor("Alice") });
  await createDocument(alice.page);

  const dialog = await openShare(alice.page);
  const email = emailFor("Twice");
  await dialog.getByLabel("Invite by email").fill(email);
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("status")).toContainText("Invitation emailed");

  await dialog.getByLabel("Invite by email").fill(email);
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("status")).toContainText("already has this access");

  await alice.context.close();
});
