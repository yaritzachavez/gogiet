import { areInternalToolsEnabled } from "@/lib/internal-tools";
import {
  getEmailFromAddress,
  getResendClient,
  hasResendApiKey,
} from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!areInternalToolsEnabled()) {
    return Response.json(
      { success: false, error: "Not Found" },
      { status: 404 },
    );
  }

  if (!hasResendApiKey()) {
    return Response.json(
      {
        success: false,
        error: "No se pudo enviar el correo de prueba.",
      },
      { status: 500 },
    );
  }

  try {
    const resend = getResendClient();

    const data = await resend.emails.send({
      from: getEmailFromAddress(),
      to: "yaritzachavezc@gmail.com",
      subject: "Gogi Eats funcionando 🚀",
      html: `
        <h1>Correo funcionando</h1>
        <p>Tu sistema de correos ya quedó listo.</p>
      `,
    });

    return Response.json({
      success: true,
      message: "Correo de prueba enviado.",
      id: data?.data?.id ?? null,
    });
  } catch (error) {
    console.error("/api/test-email error:", error);

    return Response.json(
      {
        success: false,
        error: "No se pudo enviar el correo de prueba.",
      },
      { status: 500 },
    );
  }
}
