# TEST FIXTURE, not emitter output. Declares only the one resource this case's
# address map points at. The other two references are bound to null, which
# validate accepts and the provider refuses at plan time, naming the key.

resource "aws_connect_hours_of_operation" "main_line" {
  instance_id = var.connect_instance_id
  name        = "main-line"
  time_zone   = "EST"

  config {
    day = "MONDAY"

    start_time {
      hours   = 8
      minutes = 0
    }

    end_time {
      hours   = 17
      minutes = 0
    }
  }
}
