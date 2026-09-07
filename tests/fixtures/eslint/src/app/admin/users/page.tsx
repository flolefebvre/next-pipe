// Skips a layer: `admin/users/pipe.ts` exports `pagePipe`, so reaching past it
// to the app-level one drops the admin middlewares.
import { pagePipe } from "@/app/pipe";

export default pagePipe.handle(async () => <main>users</main>);
