-- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 21, 2025 at 02:51 PM
-- Server version: 10.4.27-MariaDB
-- PHP Version: 8.1.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `environmental_health_wil_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `wil_application`
--

CREATE TABLE `wil_application` (
  `id` int(11) NOT NULL,
  `province` varchar(100) DEFAULT NULL,
  `title` varchar(20) DEFAULT NULL,
  `initials` varchar(10) DEFAULT NULL,
  `surname` varchar(100) DEFAULT NULL,
  `first_names` varchar(100) DEFAULT NULL,
  `student_number` varchar(20) DEFAULT NULL,
  `level_of_study` varchar(50) DEFAULT NULL,
  `race` varchar(50) DEFAULT NULL,
  `gender` varchar(10) DEFAULT NULL,
  `email_address` varchar(100) DEFAULT NULL,
  `physical_address` text DEFAULT NULL,
  `home_town` varchar(100) DEFAULT NULL,
  `cell_phone_number` varchar(20) DEFAULT NULL,
  `municipality_name` varchar(100) DEFAULT NULL,
  `town_situated` varchar(100) DEFAULT NULL,
  `contact_person` varchar(100) DEFAULT NULL,
  `contact_email` varchar(100) DEFAULT NULL,
  `telephone_number` varchar(20) DEFAULT NULL,
  `contact_cell_phone` varchar(20) DEFAULT NULL,
  `declaration_info_1` text DEFAULT NULL,
  `declaration_info_2` text DEFAULT NULL,
  `declaration_info_3` text DEFAULT NULL,
  `signature_image` varchar(255) DEFAULT NULL,
  `id_document` varchar(255) DEFAULT NULL,
  `cv_document` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `wil_application`
--

INSERT INTO `wil_application` (`id`, `province`, `title`, `initials`, `surname`, `first_names`, `student_number`, `level_of_study`, `race`, `gender`, `email_address`, `physical_address`, `home_town`, `cell_phone_number`, `municipality_name`, `town_situated`, `contact_person`, `contact_email`, `telephone_number`, `contact_cell_phone`, `declaration_info_1`, `declaration_info_2`, `declaration_info_3`, `signature_image`, `id_document`, `cv_document`) VALUES
(1, 'KwaZulu-Natal', 'Mr', 'TM', 'Mkhize', 'Thabo Mkhize', '202312345', 'NDip', 'African', 'Male', 'thabo@live.mut.ac.za', '123 Main Street, Durban', 'Durban', '0731234567', 'MUT', 'Durban', 'Dr Zulu', 'zulu@mut.ac.za', '0311234567', '0739876543', 'Agree 1', 'Agree 2', 'Agree 3', 'uploads/sig1.png', 'uploads/documents/id1.pdf', 'uploads/documents/cv1.pdf'),
(2, 'Gauteng', 'Ms', 'NL', 'Nkosi', 'Nomusa Nkosi', '202312346', 'NDip', 'African', 'Female', 'nomusa@live.mut.ac.za', '45 City Road, JHB', 'Johannesburg', '0721234567', 'UJ', 'Johannesburg', 'Dr Dlamini', 'dlamini@uj.ac.za', '0113456789', '0719876543', 'Agree 1', 'Agree 2', 'Agree 3', 'uploads/signatures/sig1.png', 'uploads/documents/id.pdf', 'uploads/documents/cv.pdf'),
(3, 'Eastern Cape', 'Mr', 'LS', 'Sibeko', 'Lwazi Sibeko', '202312347', 'BTech', 'Coloured', 'Male', 'lwazi@live.mut.ac.za', '789 East Avenue', 'East London', '0761234567', 'WSU', 'East London', 'Dr Mbeki', 'mbeki@wsu.ac.za', '0431234567', '0781234567', 'Agree 1', 'Agree 2', 'Agree 3', 'sig3.png', 'id3.pdf', 'cv3.pdf'),
(4, 'Western Cape', 'Ms', 'TJ', 'Jacobs', 'Tammy Jacobs', '202312348', 'NDip', 'White', 'Female', 'tammy@live.mut.ac.za', '12 Beach Road', 'Cape Town', '0821234567', 'CPUT', 'Cape Town', 'Dr Steyn', 'steyn@cput.ac.za', '0211234567', '0849876543', 'Agree 1', 'Agree 2', 'Agree 3', 'sig4.png', 'id4.pdf', 'cv4.pdf'),
(5, 'Limpopo', 'Mr', 'KM', 'Mokoena', 'Kgosi Mokoena', '202312349', 'NDip', 'African', 'Male', 'kgosi@live.mut.ac.za', '90 Hilltop Rd', 'Polokwane', '0711234567', 'UL', 'Polokwane', 'Dr Maluleke', 'maluleke@ul.ac.za', '0151234567', '0799876543', 'Agree 1', 'Agree 2', 'Agree 3', 'sig5.png', 'id5.pdf', 'cv5.pdf'),
(6, 'North West', 'Ms', 'MP', 'Pule', 'Mpho Pule', '202312350', 'NDip', 'African', 'Female', 'mpho@live.mut.ac.za', '88 Freedom St', 'Mafikeng', '0741234567', 'NWU', 'Mafikeng', 'Dr Tshepo', 'tshepo@nwu.ac.za', '0181234567', '0829876543', 'Agree 1', 'Agree 2', 'Agree 3', 'sig6.png', 'id6.pdf', 'cv6.pdf'),
(7, 'Free State', 'Mr', 'TJ', 'Jansen', 'Tiaan Jansen', '202312351', 'BTech', 'White', 'Male', 'tiaan@live.mut.ac.za', '120 Farm Way', 'Bloemfontein', '0734567890', 'UFS', 'Bloemfontein', 'Dr du Plessis', 'duplessis@ufs.ac.za', '0511234567', '0827654321', 'Agree 1', 'Agree 2', 'Agree 3', 'sig7.png', 'id7.pdf', 'cv7.pdf'),
(8, 'Mpumalanga', 'Ms', 'BK', 'Khumalo', 'Bongi Khumalo', '202312352', 'NDip', 'African', 'Female', 'bongi@live.mut.ac.za', '34 Sunshine Blvd', 'Mbombela', '0724567890', 'UNISA', 'Mbombela', 'Dr Mthembu', 'mthembu@unisa.ac.za', '0131234567', '0831234567', 'Agree 1', 'Agree 2', 'Agree 3', 'sig8.png', 'id8.pdf', 'cv8.pdf'),
(9, 'Northern Cape', 'Mr', 'VR', 'Rossouw', 'Victor Rossouw', '202312353', 'NDip', 'White', 'Male', 'victor@live.mut.ac.za', '76 Desert Rd', 'Kimberley', '0764567890', 'Sol Plaatje', 'Kimberley', 'Dr Louw', 'louw@spu.ac.za', '0531234567', '0812345678', 'Agree 1', 'Agree 2', 'Agree 3', 'sig9.png', 'id9.pdf', 'cv9.pdf'),
(10, 'KwaZulu-Natal', 'Ms', 'SZ', 'Zulu', 'Sanelisiwe Zulu', '202312354', 'NDip', 'African', 'Female', 'saneli@live.mut.ac.za', '101 Palm Rd', 'Richards Bay', '0791234567', 'MUT', 'Durban', 'Dr Mhlongo', 'mhlongo@mut.ac.za', '0319876543', '0839876543', 'Agree 1', 'Agree 2', 'Agree 3', 'sig10.png', 'id10.pdf', 'cv10.pdf'),
(11, 'Gauteng', 'Mr', 'JD', 'Doe', 'John', '12345678', '3', 'African', 'Male', 'john.doe@example.com', '123 Main St, Pretoria', 'Pretoria', '0821234567', 'University of Pretoria', 'Pretoria', 'Jane Smith', 'jane.smith@up.ac.za', '0123456789', '0831234567', '1', '1', '1', 'uploads/signature/sig1.png', 'uploads/id1.pdf', 'uploads/cv1.pdf');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `wil_application`
--
ALTER TABLE `wil_application`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `wil_application`
--
ALTER TABLE `wil_application`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
