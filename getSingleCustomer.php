<?php
include "configuration.php";

$data = array ();

$q = mysqli_query($conn , "SELECT * FROM cust where custID ORDER BY custID DESC LIMIT 1");

while($row = mysqli_fetch_object($q)){
    $data[] = $row;

}

echo json_encode($data);
echo mysqli_error($conn);


?>