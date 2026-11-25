# TEST FIXTURE, not emitter output. Every reference in this case resolves to a
# resource the emitter writes itself, so nothing is stubbed: the deliberately
# bogus address map entry for the unaliased module is expected to be ignored,
# and validate would fail here if it were not.
