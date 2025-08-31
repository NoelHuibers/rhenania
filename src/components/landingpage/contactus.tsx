// components/landingpage/contactus.tsx
import { getActiveImageBySection } from "~/server/actions/bilder/images";
import ContactButton from "./contactbutton";

const ContactUs = async () => {
  const footerImage = await getActiveImageBySection("footer");
  const backgroundImageUrl = footerImage?.imageUrl || "/background.png";

  return (
    <section
      className="flex h-screen w-full items-center justify-center bg-center bg-cover md:h-[60vh]"
      style={{
        backgroundImage: `url('${backgroundImageUrl}')`,
      }}
    >
      <ContactButton />
    </section>
  );
};

export default ContactUs;
