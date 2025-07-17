<?php 
include "configuration.php";
$input = file_get_contents('php://input');
$data = json_decode($input, true);
$message = array();
$name = $data['name'];
$surname = $data['surname'];
$username = $data['username'];
$email = $data['email'];
$contact = $data['contact'];

$q = mysqli_query($conn, "INSERT INTO cust (name, surname, username, email, contact) VALUES ('$name','$surname','$username','$email','$contact')");

if($q) {
    http_response_code(201);
    $message['status'] = 'Success';
}else {
    http_response_code(422);
    $message['status'] = 'Error';
}

echo json_encode($message);
echo mysqli_error($conn);

?>