import HeaderContent from "./headercontent";

const HeaderColored = () => {
	return (
		<header className="flex items-center justify-between bg-red-100 px-4 py-3 text-gray-900">
			<HeaderContent />
		</header>
	);
};

export default HeaderColored;
