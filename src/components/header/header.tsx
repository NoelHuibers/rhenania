import HeaderContent from "./headercontent";

const Header = () => {
	return (
		<header className="fixed top-0 z-50 flex w-full items-center justify-between bg-gray-900 px-4 py-3 text-white">
			<HeaderContent />
		</header>
	);
};

export default Header;
