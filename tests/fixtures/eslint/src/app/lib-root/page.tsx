import { pagePipe } from "@flefebvre/next-pipe/pipes";

export default pagePipe().handle(async () => <main>library root</main>);
