// A function-level directive is out of scope: this file is not a "use server"
// module, so its exports are not checked.
export async function deleteNote() {
  "use server";
  return undefined;
}
