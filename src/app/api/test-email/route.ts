import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
  try {
    const data = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
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
    return Response.json({
      success: false,
      error,
    });
  }
}
