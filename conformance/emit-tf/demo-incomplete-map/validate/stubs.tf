# TEST FIXTURE, not emitter output. Declares only the one resource this case's
# address map points at. The other two references have no address, so validate
# is expected to fail on their placeholders and on nothing else.

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
