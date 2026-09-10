# TEST FIXTURE, not emitter output. Declares the one resource this case's
# address map points at. The module references resolve to resources the emitter
# writes itself, so nothing is stubbed for them: the deliberately bogus address
# map entry for the module is expected to be ignored, and validate would fail
# here if it were not.

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

resource "aws_connect_queue" "appointments" {
  instance_id           = var.connect_instance_id
  name                  = "appointments"
  hours_of_operation_id = aws_connect_hours_of_operation.main_line.hours_of_operation_id
}
