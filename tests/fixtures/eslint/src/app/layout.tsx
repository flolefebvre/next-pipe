import { layoutPipe } from "./pipe";
import { AdminMiddleware } from "@/lib/middlewares";

export default layoutPipe.use(AdminMiddleware).handle(async () => <div />);
