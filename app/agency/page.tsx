// /agency não tinha índice: quem digitava o endereço "de cabeça" caía num 404
// (aconteceu com o CEO em 03/08/2026). O painel vive em /agency/dashboard;
// esta página só leva até lá.
import { redirect } from "next/navigation";

export default function AgencyIndex(): never {
  redirect("/agency/dashboard");
}
