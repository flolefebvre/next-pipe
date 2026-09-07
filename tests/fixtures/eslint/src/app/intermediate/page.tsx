import { pagePipe } from "../pipe";
import { AdminMiddleware } from "@/lib/middlewares";

const page = pagePipe.use(AdminMiddleware);

export default page.handle(async () => <main>intermediate</main>);
