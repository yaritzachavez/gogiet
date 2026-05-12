import { getEmailFromAddress, getResendClient, hasResendApiKey } from "@/lib/resend";

export async function GET() {
  if (!hasResendApiKey()) {
    console.error("/api/test-email: falta RESEND_API_KEY");

    return Response.json(
      {
        success: false,
        error: "Falta configurar RESEND_API_KEY",
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
      data,
    });
  } catch (error) {
    console.error("/api/test-email error:", error);

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo enviar el correo de prueba",
      },
      { status: 500 },
    );
  }
}
