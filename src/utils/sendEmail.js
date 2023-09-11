import sgMail from "@sendgrid/mail";

const sendEmail = (email, verificationToken) => {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  const msg = {
    to: `${email}`,
    from: "eliszewskipawel@gmail.com",
    subject: "Verification link",
    text: `To verify your account please go to http://localhost:4000/api/users/verify/${verificationToken}`,
  };
  sgMail
    .send(msg)
    .then(() => {
      console.log("Email sent");
    })
    .catch((error) => {
      console.error(error);
    });
};

export default sendEmail;
